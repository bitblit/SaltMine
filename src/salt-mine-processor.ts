import {SaltMineEntry} from "./salt-mine-entry";
import {SaltMine} from './salt-mine';

export interface SaltMineProcessor
{
    getSaltMineType() : string;

    // Salt mine passes in a copy of itself in case the processor needs to re-enqueue something
    processEntry(entry: SaltMineEntry, saltMine: SaltMine) : Promise<any>;
}