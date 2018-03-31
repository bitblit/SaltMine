import {WorkQueueEntry} from "./work-queue-entry";
import * as AWS from "aws-sdk";
import {Logger} from "@bitblit/ratchet/dist/common/logger";
import {WorkQueueProcessor} from "./work-queue-processor";
import {WorkQueueResult} from "./work-queue-result";
import {Context} from "aws-lambda";

/**
 * We use a FIFO queue so that 2 different Lambdas don't both work on the same
 * thing at the same time.
 */
export class SaltMine
{
    public static SALT_MINE_MARKER ="__SALT_MINE";
    private queueUrl : string;
    private notificationArn : string;
    private processors : WorkQueueProcessor[];
    private sqs : AWS.SQS;
    private sns : AWS.SNS;

    public constructor(processors : WorkQueueProcessor[],
                        queueUrl : string,
                        notificationArn : string,
                        sqs: AWS.SQS = new AWS.SQS({apiVersion: '2012-11-05',region: 'us-east-1'}),
                        sns : AWS.SNS = new AWS.SNS({apiVersion: '2012-11-05',region: 'us-east-1'})) {
        Logger.info("Creating WorkQueueService");
        if (!processors || processors.length==0)
        {
            throw "Cannot create with no processors";
        }
        processors.forEach(p=>this.validateProcessor(p));
        if (!queueUrl)
        {
            throw "Queue url is required";
        }
        if (!notificationArn)
        {
            throw "Notification ARN is required";
        }
        this.queueUrl = queueUrl;
        this.notificationArn = notificationArn;
        this.processors = processors;
        this.sqs = sqs;
        this.sns = sns;
    }

    private validateProcessor(p: WorkQueueProcessor)
    {
        if (!p)
        {
            throw "Processor is null";
        }
        if (!p.getType() || p.getType().length==0)
        {
            throw "Processor returns null/empty type";
        }
    }

    private findProcessor(type:string) : WorkQueueProcessor
    {
        let up: string = type.toUpperCase();
        let filtered : WorkQueueProcessor[] = this.processors.filter(p=>up==p.getType().toUpperCase());
        if (filtered.length==0)
        {
            Logger.warn("Found no matching processor for %s",up);
            return null;
        }
        else if (filtered.length>1)
        {
            Logger.warn("Found %d matching processors for %s, returning first", filtered.length, up);
        }
        return filtered[0];
    }

    private validType(type:string) : boolean
    {
        return this.findProcessor(type)!=null;
    }

    public createEntry(type: string, data: any = {}, metadata: any = {}) : WorkQueueEntry
    {
        if (!this.validType(type))
        {
            Logger.warn("Tried to create invalid type : "+type);
            return null;
        }

        return {
            created: new Date().getTime(),
            type: type,
            data: data,
            metadata: metadata

        } as WorkQueueEntry;
    }

    public validEntry(entry:WorkQueueEntry) : boolean {
        return (entry!=null && entry.type!=null && this.validType(entry.type));
    }

    public takeAndProcessQueueEntry(): Promise<WorkQueueEntry> {
        return this.takeQueueEntry().then(entry=>{
            if (entry)
            {
                return this.processEntry(entry); // Max 1 minute
            }
            else
            {
                Logger.info("Skipping process - no entry found");
                return null;
            }
        });
    }

    public takeQueueEntry(): Promise<WorkQueueEntry> {
        let params = {
            MaxNumberOfMessages: 1,
            QueueUrl: this.queueUrl,
            VisibilityTimeout: 300,
            WaitTimeSeconds: 0
        };

        return this.sqs.receiveMessage(params).promise().then(
            res=>
            {
                let entry : WorkQueueEntry = null;
                let handle : string | undefined = undefined;

                if (res.Messages && res.Messages.length==1)
                {
                    let body = res.Messages[0].Body;
                    if (body)
                    {
                        entry = JSON.parse(body) as WorkQueueEntry;
                        handle = res.Messages[0].ReceiptHandle;
                    }
                }

                Logger.info("Entry was : %s", JSON.stringify(entry));

                if (handle)
                {
                    Logger.debug("Removing entry from work queue");
                    let delParams = {
                        QueueUrl: this.queueUrl,
                        ReceiptHandle: handle
                    };
                    return this.sqs.deleteMessage(delParams).promise().then(delResult=>{
                        Logger.debug("Delete succeeded");
                        return entry;
                    })
                        .catch(delErr=>{
                            Logger.warn("Delete failed - task will likely re-run.  Err was : %s",delErr);
                            return entry;
                        })
                }
                else
                {
                    return entry;
                }

            }
        ).catch(err=>{
            Logger.warn("Error reading queue : "+err);
            return null;
        })
    }

    public addEntryToQueue(entry: WorkQueueEntry): Promise<any> {
        if (this.validEntry(entry))
        {
            entry._marker = SaltMine.SALT_MINE_MARKER;
            let params = {
                DelaySeconds:0,
                MessageBody: JSON.stringify(entry),
                MessageGroupId: entry.type,
                QueueUrl: this.queueUrl
            };

            Logger.debug("Adding %s to queue", JSON.stringify(entry));
            return this.sqs.sendMessage(params).promise();
        }
        else
        {
            Logger.warn("Not adding invalid entry to queue : %s",JSON.stringify(entry));
            return Promise.resolve(null);
        }
    }

    public fireStartProcessingRequest() : Promise<any>
    {
        let request = {'type':'START_PROCESSING', created: new Date().getTime()};

        let params = {
            Message: JSON.stringify(request),
            TopicArn: this.notificationArn
        };

        return this.sns.publish(params).promise();
    }

    public processEntry(entry: WorkQueueEntry) : Promise<any>
    {
        let start : number = new Date().getTime();
        if (entry)
        {
            let processor : WorkQueueProcessor = this.findProcessor(entry.type);
            if (processor)
            {
                return processor.processEntry(entry).then(result=>{
                    return {
                        startTimestamp : start,
                        finishTimestamp : new Date().getTime(),
                        source : entry,
                        result : result,
                        error : null
                    } as WorkQueueResult;
                })
                    .catch (err=>{
                        return {
                            startTimestamp : start,
                            finishTimestamp : new Date().getTime(),
                            source : entry,
                            result : null,
                            error : err
                        } as WorkQueueResult;
                    });
            }
        }

        // If we reach here, resolve with a broken one
        return Promise.resolve(
        {
            startTimestamp : start,
                finishTimestamp : start,
            source : entry,
            result : null,
            error : "Missing entry or processor"
        } as WorkQueueResult
    );

    }

    public chainRunWorkQueueTasks(context: Context, minRemainTimeInSeconds: number) : Promise<any>
    {
        return this.takeAndProcessQueueEntry().then(res=>{
            if (res==null)
            {
                Logger.info("Work queue is now empty - stopping");
                return null;
            }
            else
            {
                // Check if we have enough time left to run another pull (minRemainTimeInSeconds seconds)
                if (context.getRemainingTimeInMillis()>(minRemainTimeInSeconds*1000))
                {
                    Logger.info("Still have more than 90 seconds remaining (%d ms) - running again", context.getRemainingTimeInMillis());
                    return this.chainRunWorkQueueTasks(context,minRemainTimeInSeconds);
                }
                else
                {
                    Logger.info("Less than 90 seconds remaining but still have work to do - refiring");
                    return this.fireStartProcessingRequest();
                }
            }
        })
            .catch(err=>{
                context.succeed("SQS Pull failed : "+err);
            })

    }

}
