import {WorkQueueEntry} from "./work-queue-entry";

export interface WorkQueueProcessor
{
    getType() : string;
    processEntry(entry: WorkQueueEntry) : Promise<any>;
}