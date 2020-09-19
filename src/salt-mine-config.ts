import * as AWS from 'aws-sdk';

export interface SaltMineConfig {
  validTypes: string[];

  queueUrl: string;
  notificationArn: string;

  sqs: AWS.SQS;
  sns: AWS.SNS;
}
