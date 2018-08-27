import {SaltMineEntry} from "./salt-mine-entry";
import {SaltMineProcessor} from "./salt-mine-processor";
import {Logger} from "@bitblit/ratchet/dist/common/logger";

export class EchoProcessor implements SaltMineProcessor
{
    getSaltMineType() : string
    {
        return 'echo';
    }

    processEntry(entry: SaltMineEntry) : Promise<any>
    {
        Logger.info("Echo processing : %s",JSON.stringify(entry));
        return Promise.resolve(entry);
    }
}