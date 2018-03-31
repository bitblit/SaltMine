import { expect } from 'chai';
import {WorkQueueProcessor} from "../src/work-queue-processor";
import {WorkQueueEntry} from "../src/work-queue-entry";
import {SaltMine} from "../src/salt-mine";

describe('#createEntry', function() {
    it('should make sure a processor exists', function() {
        let a = <WorkQueueProcessor>{
            getType: () : string => { return 'a';},
            processEntry : (entry: WorkQueueEntry) : Promise<any> => { return Promise.resolve('a')}
        };
        let b = <WorkQueueProcessor>{
            getType: () : string => { return 'b';},
            processEntry : (entry: WorkQueueEntry) : Promise<any> => { return Promise.resolve('b')}
        };

        let processors : WorkQueueProcessor[] = [a,b];

        let saltMine : SaltMine = new SaltMine(processors,'a','b');
        let resultA = saltMine.createEntry('a',{},{});
        let resultC = saltMine.createEntry('c',{},{});
        expect(resultA.type).to.equal('a');
        expect(resultC).to.equal(null);
    });
});