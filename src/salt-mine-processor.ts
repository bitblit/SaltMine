import {SaltMineEntry} from "./salt-mine-entry";

export interface SaltMineProcessor
{
    getType() : string;
    processEntry(entry: SaltMineEntry) : Promise<any>;
}