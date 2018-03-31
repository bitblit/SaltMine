import {SaltMineEntry} from "./salt-mine-entry";

export interface SaltMineResult
{
    startTimestamp : number;
    finishTimestamp : number;
    source : SaltMineEntry;
    result : any;
    error : any;
}