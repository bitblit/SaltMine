import {WorkQueueEntry} from "./work-queue-entry";

export interface WorkQueueResult
{
    startTimestamp : number;
    finishTimestamp : number;
    source : WorkQueueEntry;
    result : any;
    error : any;
}