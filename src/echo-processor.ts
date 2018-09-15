import {SaltMineEntry} from "./salt-mine-entry";
import {Logger} from "@bitblit/ratchet/dist/common/logger";
import {SaltMineFunction} from './salt-mine-function';

const saltMineEcho: SaltMineFunction<SaltMineEntry>  = function(entry: SaltMineEntry) : Promise<SaltMineEntry> {
    Logger.info("Echo processing : %j", entry);
    return Promise.resolve(entry);
}

export default saltMineEcho;
