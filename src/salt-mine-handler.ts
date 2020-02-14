import * as AWS from 'aws-sdk';
import { Logger } from '@bitblit/ratchet/dist/common/logger';
import { SaltMineEntry } from './salt-mine-entry';
import { Context, SNSEvent } from 'aws-lambda';
import { LambdaEventDetector } from '@bitblit/ratchet/dist/aws/lambda-event-detector';
import { DurationRatchet } from '@bitblit/ratchet/dist/common/duration-ratchet';
import { SaltMineConstants } from './salt-mine-constants';
import { SaltMineProcessor } from './salt-mine-processor';
import { SaltMineConfig } from './salt-mine-config';
import { SaltMineQueueUtil } from './salt-mine-queue-util';
import { ErrorRatchet } from '@bitblit/ratchet/dist/common/error-ratchet';
import { StringRatchet } from '@bitblit/ratchet/dist/common/string-ratchet';

/**
 * We use a FIFO queue so that 2 different Lambdas don't both work on the same
 * thing at the same time.
 */
export class SaltMineHandler {
  constructor(
    private cfg: SaltMineConfig,
    private processors: Map<string, SaltMineProcessor>,
    private chainRun: boolean = true,
    private chainRunMinRemainTimeInSeconds: number = 90
  ) {
    Logger.silly('Starting Salt Mine processor');

    if (!cfg || !cfg.sqs || !cfg.sns || !cfg.queueUrl || !cfg.notificationArn || !cfg.validTypes) {
      ErrorRatchet.throwFormattedErr('Invalid salt mine config : %j', cfg);
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

      if (this.chainRun && this.chainRunMinRemainTimeInSeconds > 0) {
        if (results.length == 0) {
          Logger.info('Salt mine queue now empty - stopping');
        } else if (context.getRemainingTimeInMillis() > this.chainRunMinRemainTimeInSeconds * 1000) {
          Logger.info(
            'Still have more than %d seconds remaining (%d ms) - running again',
            this.chainRunMinRemainTimeInSeconds,
            context.getRemainingTimeInMillis()
          );
          rval = rval && (await this.processSaltMineSNSEvent(event, context));
        } else {
          Logger.info('Less than 90 seconds remaining but still have work to do - refiring');
          const refireResult: string = await SaltMineQueueUtil.fireStartProcessingRequest(this.cfg);
        }
      }
    }
    return rval;
  }

  private async takeEntryFromSaltMineQueue(): Promise<SaltMineEntry[]> {
    let params = {
      MaxNumberOfMessages: 1,
      QueueUrl: this.cfg.queueUrl,
      VisibilityTimeout: 300,
      WaitTimeSeconds: 0
    };

    const message: AWS.SQS.ReceiveMessageResult = await this.cfg.sqs.receiveMessage(params).promise();
    const rval: SaltMineEntry[] = [];
    if (message && message.Messages && message.Messages.length > 0) {
      for (let i = 0; i < message.Messages.length; i++) {
        const m: AWS.SQS.Message = message.Messages[i];
        try {
          const parsedBody: SaltMineEntry = JSON.parse(m.Body) as SaltMineEntry;
          if (!parsedBody.type) {
            Logger.warn('Dropping invalid salt mine entry : %j', parsedBody);
          } else {
            rval.push(parsedBody);
          }

          Logger.debug('Removing message from queue');
          let delParams = {
            QueueUrl: this.cfg.queueUrl,
            ReceiptHandle: m.ReceiptHandle
          };
          const delResult: any = await this.cfg.sqs.deleteMessage(delParams).promise();
        } catch (err) {
          Logger.warn('Error parsing message, dropping : %j', m);
        }
      }
    } else {
      Logger.debug('No messages found (likely end of recursion)');
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

    // If we processed, immediately refire
    if (entries.length > 0) {
      const refireResult: string = await SaltMineQueueUtil.fireStartProcessingRequest(this.cfg);
    }

    return rval;
  }

  private async processSingleSaltMineEntry(e: SaltMineEntry): Promise<boolean> {
    let rval: boolean = false;
    try {
      const processor: SaltMineProcessor = this.processors.get(e.type);
      if (!processor) {
        Logger.warn('Found no processor for salt mine entry : %j (returning false)', e);
      } else {
        const start: number = new Date().getTime();
        try {
          await processor(e, this.cfg);
          rval = true;
        } catch (err) {
          Logger.warn('Error processing: %s', err, err);
        }
        const end: number = new Date().getTime();
        Logger.info('Processed %j in %s', e, DurationRatchet.formatMsDuration(end - start, true));
      }
    } catch (err) {
      Logger.error('Failed while processing salt mine entry (returning false): %j : %s', e, err, err);
    }
    return rval;
  }
}
