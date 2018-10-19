import * as AWS from 'aws-sdk';
import {SaltMineProcessor} from './salt-mine-processor';

export interface SaltMineConfig {

    processors: Map<string, SaltMineProcessor>;

    queueUrl : string;
    notificationArn : string;

    chainRun: boolean;
    chainRunMinRemainTimeInSeconds: number;

    sqs: AWS.SQS;
    sns: AWS.SNS;
}
