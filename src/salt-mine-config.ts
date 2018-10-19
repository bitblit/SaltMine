import * as AWS from 'aws-sdk';
import {SaltMineProcessor} from './salt-mine-processor';

export interface SaltMineConfig {

    processors: Map<string, SaltMineProcessor>;

    queueUrl : string;
    notificationArn : string;

    sqs: AWS.SQS;
    sns: AWS.SNS;
}
