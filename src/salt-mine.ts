import * as AWS from "aws-sdk";
import {Logger} from "@bitblit/ratchet/dist/common/logger";
import {SaltMineEntry} from "./salt-mine-entry";
import {SaltMineResult} from "./salt-mine-result";
import {SaltMineEntryBatch} from './salt-mine-entry-batch';
import {SaltMineQueueManager} from './salt-mine-queue-manager';
import {SaltMineFunction} from './salt-mine-function';

/**
 * We use a FIFO queue so that 2 different Lambdas don't both work on the same
 * thing at the same time.
 */
export class SaltMine<T>
{
    private queueManager : SaltMineQueueManager;

    public constructor(private functions : SaltMineFunction<any> [],
                        queueUrl : string,
                        notificationArn : string,
                        private context: T = null,
                        sqs: AWS.SQS = new AWS.SQS({apiVersion: '2012-11-05',region: 'us-east-1'}),
                        sns : AWS.SNS = new AWS.SNS({apiVersion: '2012-11-05',region: 'us-east-1'})) {
        Logger.info("Creating SaltMineService");
        if (!functions || Object.keys(functions).length==0)
        {
            throw "Cannot create with no functions";
        }
        if (!queueUrl)
        {
            throw "Queue url is required";
        }
        if (!notificationArn)
        {
            throw "Notification ARN is required";
        }
        this.queueManager = new SaltMineQueueManager(this.functionNames(), queueUrl, notificationArn, sqs, sns);
    }

    public functionNames() : string[] {
        return this.functions.map(f => f.name);
    }

    private findFunction(type:string) : SaltMineFunction<any>
    {
        let up: string = type.toUpperCase();
        let filtered : SaltMineFunction<any>[] = this.functions.filter(p=> up==p.name.toUpperCase());
        if (filtered.length==0) {
            Logger.warn("Found no matching function for %s",up);
            return null;
        } else if (filtered.length>1)
        {
            Logger.warn("Found %d matching function for %s, returning first", filtered.length, up);
        }
        return filtered[0];
    }

    public takeAndProcessQueueEntry(): Promise<SaltMineEntry> {
        return this.takeQueueEntry().then(entry=>{
            if (entry) {
                return this.processEntry(entry); // Max 1 minute
            } else {
                Logger.info("Skipping process - no entry found");
                return null;
            }
        });
    }


    public async processEntry(entry: SaltMineEntry) : Promise<any>
    {
        let start : number = new Date().getTime();
        if (entry) {
            let fn : SaltMineFunction<any> = this.findFunction(entry.type);
            if (fn)
            {
                try {
                const result: any = await fn(entry, this);

                return {
                        startTimestamp : start,
                        finishTimestamp : new Date().getTime(),
                        source : entry,
                        result : result,
                        error : null
                    } as SaltMineResult;
                } catch (err)
                {
                        return {
                            startTimestamp : start,
                            finishTimestamp : new Date().getTime(),
                            source : entry,
                            result : null,
                            error : err
                        } as SaltMineResult;
                }
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
        } as SaltMineResult
    );

    }


    public createEntry(type: string, data: any = {}, metadata: any = {}) : SaltMineEntry
    {
        return this.queueManager.createEntry(type, data, metadata);
    }

    public validEntry(entry:SaltMineEntry) : boolean {
        return this.queueManager.validEntry(entry);
    }

    public takeQueueEntry(): Promise<SaltMineEntry> {
        return this.queueManager.takeQueueEntry();
    }

    public addEntryToQueue(entry: SaltMineEntry): Promise<any> {
        return this.queueManager.addEntryToQueue(entry);
    }

    public addEntriesToQueue(entries: SaltMineEntry[]): Promise<any[]> {
        return this.queueManager.addEntriesToQueue(entries);
    }

    public processEntryBatch(batch: SaltMineEntryBatch) : Promise<boolean> {
        return this.queueManager.processEntryBatch(batch);
    }

    public fireStartProcessingRequest() : Promise<any>
    {
        return this.queueManager.fireStartProcessingRequest();
    }

    public fetchContext() : T {
        return this.context;
    }



}
