import {SaltMineEntry} from './salt-mine-entry';

/**
 * Can be used to submit a bunch of items to salt mine and then potentially
 * start processing.  Can also be used as a flag to just start processing
 * by submission with an empty entries array.
 *
 * This is mainly here to allow decoupling salt mine from the rest of another
 * system by means of an RXJS Subject - parties can publish to the subject, and
 * SaltMine can be made to listen to the subject, so that publishers and
 * consumers are not circularly dependant.
 */
export interface SaltMineEntryBatch
{
    entries: SaltMineEntry[];
    startProcessingAfterSubmission: boolean;
}