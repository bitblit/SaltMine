import {SaltMineEntry} from "./salt-mine-entry";
import {SaltMine} from './salt-mine';

export interface SaltMineFunction<T> {
    // The entry to process, the salt mine itself for further enqueuing or getting handle to the context in case we
    // need any objects
    (entry: SaltMineEntry, saltMine: SaltMine<any>): Promise<T>;
}
