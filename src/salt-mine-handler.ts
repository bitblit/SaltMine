import AWS from 'aws-sdk';
import { Logger, ErrorRatchet, StringRatchet, StopWatch } from '@bitblit/ratchet/dist/common';
import { SaltMineEntry } from './salt-mine-entry';
import { Context, SNSEvent } from 'aws-lambda';
import { SaltMineConstants } from './salt-mine-constants';
import { SaltMineProcessor } from './salt-mine-processor';
import { SaltMineConfig } from './salt-mine-config';
import { SaltMineQueueUtil } from './salt-mine-queue-util';
import { LambdaEventDetector } from '@bitblit/ratchet/dist/aws';

/**
 * We use a FIFO queue so that 2 different Lambdas don't both work on the same
 * thing at the same time.
 */
export class SaltMineHandler {
  constructor(private cfg: SaltMineConfig, private processors: Map<string, SaltMineProcessor | SaltMineProcessor[]>) {
    Logger.silly('Starting Salt Mine processor');
    const cfgErrors: string[] = SaltMineQueueUtil.validateConfig(cfg);
    if (cfgErrors.length > 0) {
      ErrorRatchet.throwFormattedErr('Invalid salt mine config : %j : %j', cfgErrors, cfg);
    }

    if (!processors) {
      throw new Error('You must supply processors');
    }

    let allMatch: boolean = true;
    cfg.validTypes.forEach((s) => (allMatch = allMatch && !!processors.get(s)));

    if (!allMatch || processors.size !== cfg.validTypes.length) {
      throw new Error('Mismatch between processors and config valid types');
    }
  }

  // eslint-disable-next-line  @typescript-eslint/explicit-module-boundary-types
  public isSaltMineSNSEvent(event: any): boolean {
    return this.isSaltMineStartSnsEvent(event) || this.isSaltMineImmediateFireEvent(event);
  }

  // eslint-disable-next-line  @typescript-eslint/explicit-module-boundary-types
  public isSaltMineStartSnsEvent(event: any): boolean {
    let rval: boolean = false;
    if (event) {
      if (LambdaEventDetector.isSingleSnsEvent(event)) {
        const cast: SNSEvent = event as SNSEvent;
        rval = cast.Records[0].Sns.Message === SaltMineConstants.SALT_MINE_SNS_START_MARKER;
      }
    }
    return rval;
  }

  // eslint-disable-next-line  @typescript-eslint/explicit-module-boundary-types
  public isSaltMineImmediateFireEvent(event: any): boolean {
    let rval: boolean = false;

    if (!!event) {
      if (LambdaEventDetector.isSingleSnsEvent(event)) {
        const cast: SNSEvent = event as SNSEvent;
        const msg: string = cast.Records[0].Sns.Message;
        if (!!StringRatchet.trimToNull(msg)) {
          const parsed: any = JSON.parse(msg);
          rval = !!parsed && parsed['type'] === SaltMineConstants.SALT_MINE_SNS_IMMEDIATE_RUN_FLAG;
        }
      }
    }
    return rval;
  }

  // eslint-disable-next-line  @typescript-eslint/explicit-module-boundary-types
  public parseImmediateFireSaltMineEntry(event: any): SaltMineEntry {
    let rval: SaltMineEntry = null;
    try {
      if (!!event) {
        if (LambdaEventDetector.isSingleSnsEvent(event)) {
          const cast: SNSEvent = event as SNSEvent;
          const msg: string = cast.Records[0].Sns.Message;
          if (!!StringRatchet.trimToNull(msg)) {
            const parsed: any = JSON.parse(msg);
            if (!!parsed && parsed['type'] === SaltMineConstants.SALT_MINE_SNS_IMMEDIATE_RUN_FLAG) {
              rval = parsed['saltMineEntry'];
            }
          }
        }
      }
    } catch (err) {
      Logger.error('Could not parse %j as an immediate run event : %s', event, err, err);
    }
    return rval;
  }

  public isSaltMineSqsMessage(message: AWS.SQS.Types.ReceiveMessageResult): boolean {
    let rval: boolean = false;
    if (message && message.Messages && message.Messages.length > 0) {
      const missingFlagField: any = message.Messages.find((se) => {
        try {
          const parsed: any = JSON.parse(se.Body);
          return !parsed[SaltMineConstants.SALT_MINE_SQS_TYPE_FIELD];
        } catch (err) {
          Logger.warn('Failed to parse message : %j %s', se, err);
          return true;
        }
      });
      if (missingFlagField) {
        Logger.silly('Found at least one message missing a type field');
      } else {
        rval = true;
      }
    }
    return rval;
  }

  // Either trigger a pull of the SQS queue, or process immediately
  // eslint-disable-next-line  @typescript-eslint/explicit-module-boundary-types
  public async processSaltMineSNSEvent(event: any, context: Context): Promise<boolean> {
    let rval: boolean = false;
    if (!this.isSaltMineStartSnsEvent(event)) {
      const saltMineEntry: SaltMineEntry = this.parseImmediateFireSaltMineEntry(event);
      if (!!saltMineEntry) {
        Logger.silly('Processing immediate fire event : %j', saltMineEntry);
        const result: boolean = await this.processSingleSaltMineEntry(saltMineEntry);
        return result;
      } else {
        Logger.warn('Tried to process non-salt mine start / immediate event : %j returning false', event);
        rval = false;
      }
    } else {
      const results: boolean[] = await this.takeAndProcessSingleSaltMineSQSMessage();
      rval = true;
      results.forEach((b) => (rval = rval && b)); // True if all succeed or empty

      if (results.length === 0) {
        Logger.info('Salt mine queue now empty - stopping');
      } else {
        Logger.info('Still have work to do - re-firing');
        const reFireResult: string = await SaltMineQueueUtil.fireStartProcessingRequest(this.cfg);
        Logger.silly('ReFire Result : %s', reFireResult);
      }
    }
    return rval;
  }

  private async takeEntryFromSaltMineQueue(): Promise<SaltMineEntry[]> {
    let rval: SaltMineEntry[] = [];

    if (SaltMineQueueUtil.awsConfig(this.cfg)) {
      const params = {
        MaxNumberOfMessages: 1,
        QueueUrl: this.cfg.aws.queueUrl,
        VisibilityTimeout: 300,
        WaitTimeSeconds: 0,
      };

      const message: AWS.SQS.ReceiveMessageResult = await this.cfg.aws.sqs.receiveMessage(params).promise();
      if (message && message.Messages && message.Messages.length > 0) {
        for (let i = 0; i < message.Messages.length; i++) {
          const m: AWS.SQS.Message = message.Messages[i];
          try {
            const parsedBody: SaltMineEntry = JSON.parse(m.Body);
            if (!parsedBody.type) {
              Logger.warn('Dropping invalid salt mine entry : %j', parsedBody);
            } else {
              rval.push(parsedBody);
            }

            Logger.debug('Removing message from queue');
            const delParams = {
              QueueUrl: this.cfg.aws.queueUrl,
              ReceiptHandle: m.ReceiptHandle,
            };
            const delResult: any = await this.cfg.aws.sqs.deleteMessage(delParams).promise();
            Logger.silly('Delete result : %j', delResult);
          } catch (err) {
            Logger.warn('Error parsing message, dropping : %j', m);
          }
        }
      } else {
        Logger.debug('No messages found (likely end of recursion)');
      }
    } else {
      Logger.debug('Running local - no queue');
      rval = [];
    }

    return rval;
  }

  private async takeAndProcessSingleSaltMineSQSMessage(): Promise<boolean[]> {
    const rval: boolean[] = [];
    const entries: SaltMineEntry[] = await this.takeEntryFromSaltMineQueue();

    // Do them one at a time since SaltMine is meant to throttle.  Also, it should really
    // only be one per pull anyway
    for (let i = 0; i < entries.length; i++) {
      const e: SaltMineEntry = entries[i];
      const result: boolean = await this.processSingleSaltMineEntry(e);
      rval.push(result);
    }

    // If we processed, immediately reFire
    if (entries.length > 0) {
      const reFireResult: string = await SaltMineQueueUtil.fireStartProcessingRequest(this.cfg);
      Logger.silly('ReFire Result : %s', reFireResult);
    }

    return rval;
  }

  // CAW 2020-08-08 : I am making processSingle public because there are times (such as when
  // using AWS batch) that you want to be able to run a salt mine command directly, eg, from
  // the command line without needing an AWS-compliant event wrapping it. Thus, this.
  public async processSingleSaltMineEntry(e: SaltMineEntry): Promise<boolean> {
    let rval: boolean = false;
    try {
      const processorInput: SaltMineProcessor | SaltMineProcessor[] = this.processors.get(e.type);
      if (!processorInput) {
        Logger.warn('Found no processor for salt mine entry : %j (returning false)', e);
      } else {
        const sw: StopWatch = new StopWatch(true);
        try {
          const procArr: SaltMineProcessor[] = Array.isArray(processorInput) ? processorInput : [processorInput];
          for (let i = 0; i < procArr.length; i++) {
            Logger.info('%s : Step %d of %d', e.type, i + 1, procArr.length);
            await procArr[i](e, this.cfg);
          }
          rval = true;
        } catch (err) {
          Logger.warn('Error processing: %s', err, err);
        }
        sw.stop();
        Logger.info('Processed %j : %s', e, sw.dump());
      }
    } catch (err) {
      Logger.error('Failed while processing salt mine entry (returning false): %j : %s', e, err, err);
    }
    return rval;
  }

  // Returns a copy so you cannot modify the internal one here
  public getConfig(): SaltMineConfig {
    const rval: SaltMineConfig = Object.assign({}, this.cfg);
    return rval;
  }
}
