import * as AWS from "aws-sdk";
import {Logger} from "@bitblit/ratchet/dist/common/logger";
import {SaltMineProcessor} from "./salt-mine-processor";
import {SaltMineEntry} from "./salt-mine-entry";
import {SaltMineResult} from "./salt-mine-result";
import {SaltMineEntryBatch} from './salt-mine-entry-batch';
import {SaltMineQueueManager} from './salt-mine-queue-manager';

/**
 * We use a FIFO queue so that 2 different Lambdas don't both work on the same
 * thing at the same time.
 */
export class SaltMine
{
    public static SALT_MINE_START_MARKER ="__START_SALT_MINE";
    private queueManager : SaltMineQueueManager;
    private processors : SaltMineProcessor[];

    // Given a list of objects, extracts the processors
    public static findProcessors(src: any[]): SaltMineProcessor[] {
        return src.filter(s => SaltMine.isSaltMineProcessor(s));
    }

    public static isSaltMineProcessor(src: any): boolean {
        return (src && (typeof src['getSaltMineType'] === 'function') && (typeof src['processEntry'] === 'function'));
    }

    public constructor(processors : SaltMineProcessor[],
                        queueUrl : string,
                        notificationArn : string,
                        sqs: AWS.SQS = new AWS.SQS({apiVersion: '2012-11-05',region: 'us-east-1'}),
                        sns : AWS.SNS = new AWS.SNS({apiVersion: '2012-11-05',region: 'us-east-1'})) {
        Logger.info("Creating SaltMineService");
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
        this.processors = processors;
        const processorNames: string[] = this.processors.map( p => p.getSaltMineType());
        this.queueManager = new SaltMineQueueManager(processorNames, queueUrl, notificationArn, sqs, sns);
    }

    private validateProcessor(p: SaltMineProcessor)
    {
        if (!p)
        {
            throw "Processor is null";
        }
        if (!p.getSaltMineType() || p.getSaltMineType().length==0)
        {
            throw "Processor returns null/empty type";
        }
    }

    private findProcessor(type:string) : SaltMineProcessor
    {
        let up: string = type.toUpperCase();
        let filtered : SaltMineProcessor[] = this.processors.filter(p=>up==p.getSaltMineType().toUpperCase());
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

    public takeAndProcessQueueEntry(): Promise<SaltMineEntry> {
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


    public processEntry(entry: SaltMineEntry) : Promise<any>
    {
        let start : number = new Date().getTime();
        if (entry)
        {
            let processor : SaltMineProcessor = this.findProcessor(entry.type);
            if (processor)
            {
                return processor.processEntry(entry, this).then(result=>{
                    return {
                        startTimestamp : start,
                        finishTimestamp : new Date().getTime(),
                        source : entry,
                        result : result,
                        error : null
                    } as SaltMineResult;
                })
                    .catch (err=>{
                        return {
                            startTimestamp : start,
                            finishTimestamp : new Date().getTime(),
                            source : entry,
                            result : null,
                            error : err
                        } as SaltMineResult;
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



}
