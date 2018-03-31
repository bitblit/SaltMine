export interface WorkQueueEntry
{
    _marker : string;
    created: number;
    type: string;
    data: any;
    metadata: any;
}