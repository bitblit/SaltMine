# @bitblit/SaltMine

A utility for running a batch work queue on top of Lambda/SQS/SNS

## Introduction

A pretty common problem I have when I do serverless development is that I have some tasks that really
should be run asynchronously, so they belong in a queue system.  But there aren't that many of them, and
I don't really want to use the complementary resources (like DynamoDB) that would be needed to run 
1000 of them simultaneously.  I may need to queue up about 400-500 of them, and then let that bleed
out over a couple minutes.  Also, some of them may need a fair amount of time (over a minute) but others
only need a few seconds so if I set the Lambda to have a 5 minute timeout I'd like to process more
than one in a call if I can get away with it.

Enter SaltMine.  It is a class that allows you to:
* Define a set of processors that can handle these tasks.  They'll get handed an object with arbitrary
data and metadata, and must return a Promise<any>
* You can use it to enqueue a task for later processing
* You can tell it to take a queued task (if any) and perform it
* You can tell it to take a task, perform it, and if there is still enough time remaining, do it again.

That's about it.  SaltMine is really meant to be called from API Gateway Lambda's to queue up later tasks,
and from a Cron Lambda to occasionally see if there is anything to be processed.  The trick is that it also
provides an SNS listening Lambda to autofire whenever a notification comes in that there is work to be done.


## Usage

To use it, you first create:

1. An SNS Topic.  You'll need its arn.
2. An SQS Queue.  You'll need its url, and obviously you'll need to set up IAM correctly to read/write it.  
The queue should be configured to notify the SNS topic upon arrival of an entry.
3. A set of classes implementing WorkQueueProcessor.  These will be matched to submitted tasks by the
"type" field, which must match the return value of "getType" in the processor.


Once that is set up, you create a SaltMine instance by passing it the queue url, notification arn, and
set of processors (and optionally the SNS and SQS instances).  You can then submit new tasks using that
object, and also either process tasks directly, or by using the Lambda adapter.

The lambda adapter is meant to be called from within a Lambda handler - you can use its functions to
check whether the incoming event is a SNS-SaltMine event, and if so hand it off, otherwise continue to
your other logic.

## AWS Resource Creation

### SNS Topic

Create an SNS topic.  Note its ARN and name.  If you want to know any time the queue is being
fired you can also add your email to it, but that's unnecessary except when debugging - you can
pretty much just leave it alone.  This is only here as a Lambda signaling mechanism.

Importantly - the SQS is NOT signed up to the topic.  First of all it can't be if you are using
FIFO queues (At least as of 04/2018) and second of all because if it were, it would fire multiple
requests (1 per incoming message) and we don't want to process the whole queue at once, we want to
drain it one request at a time to respect throttling.

### SQS

Your mileage may vary, but I create mine like this :

* FIFO Queue (Single run of each task, and tasks execute in the order they are enqueued)
* Default Visibility Timeout:	5 minutes (If the Lambda fails unexpectedly it can be retried when it shows 
back up in the message queue)
* Message Retention Period:	20 minutes (If it hasn't been processed in 20 minutes its likely no longer relevant)
* Maximum Message Size:	256 KB (Far bigger than your normal SaltMine message)
* Receive Message Wait Time:	0 seconds (Any task can be picked up immediately)
* Content based deduplication : On ()


## Installation
`npm install @bitblit/saltmine`

## Dependencies

Depends heavily on the AWS library, but it is a transient dependency so that it doesn't get bundled when
creating a Lambda.  Also, depends on my [Ratchet library](https://github.com/bitblit/Ratchet) for general
utilities.

# Testing

To run the tests,

`npm test`


# Deployment

These are just notes-to-self on how to do this.  ALl the logic is actually in my 
 [CircleCI](https://circleci.com) script, so the key thing is to know that to do a
 release you must:

```
    git commit -m "New stuff"
    git tag -a release-0.0.5 -m "Because I like it a lot"
    git push origin master --tags

```

# Contributing

Pull requests are welcome, although I'm not sure why you'd be interested!
