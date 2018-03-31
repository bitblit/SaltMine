import {Logger} from "@bitblit/ratchet/dist/common/logger";
import {Callback, Context} from "aws-lambda";
import {SaltMine} from "./salt-mine";
import {LambdaEventDetector} from "@bitblit/ratchet/dist/aws/lambda-event-detector";

/**
 * Lambda Extensions for SaltMine
 */
export class SaltMineLambda
{
    public static isSaltMineEvent(event:any) : boolean
    {
        let rval : boolean = false;
        if (LambdaEventDetector.isValidSnsEvent(event)) {
            let msg = event.Records[0].Sns.Message;
            rval = (msg && msg._marker && msg._marker == SaltMine.SALT_MINE_MARKER);
        }
        return rval;
    }

    public static processSaltMineEvent(event: any, context: Context, callback: Callback, saltMine: SaltMine, minRemainTimeInSeconds: number)
    {
        if (SaltMineLambda.isSaltMineEvent(event))
        {
            if (event.Records && event.Records.length>1)
            {
                Logger.warn("Multi-record received, but SaltMine processes singles.  Check your config, there will be loss");
            }
            let msg = event.Records[0].Sns.Message;
            Logger.info("Received SNS event : Triggering SQS pull");
            SaltMineLambda.chainRunSaltMineTasks(saltMine, context, minRemainTimeInSeconds).then(res=>{
                context.succeed("SaltMine pull fired")
            })
                .catch(err=>{
                    context.succeed("SaltMine Pull failed : "+err);
                })
        }
        else
        {
            Logger.warn("Called processSaltMineEvent on a non salt mine event - dropping");
            callback(null, false);
        }

    }

    public static chainRunSaltMineTasks(saltMine: SaltMine, context: Context, minRemainTimeInSeconds: number) : Promise<any>
    {
        return saltMine.takeAndProcessQueueEntry().then(res=>{
            if (res==null)
            {
                Logger.info("Salt mine queue is now empty - stopping");
                return null;
            }
            else
            {
                // Check if we have enough time left to run another pull (minRemainTimeInSeconds seconds)
                if (context.getRemainingTimeInMillis()>(minRemainTimeInSeconds*1000))
                {
                    Logger.info("Still have more than 90 seconds remaining (%d ms) - running again", context.getRemainingTimeInMillis());
                    return SaltMineLambda.chainRunSaltMineTasks(saltMine,context,minRemainTimeInSeconds);
                }
                else
                {
                    Logger.info("Less than 90 seconds remaining but still have work to do - refiring");
                    return saltMine.fireStartProcessingRequest();
                }
            }
        })
            .catch(err=>{
                context.succeed("SQS Pull failed : "+err);
            })

    }

}
