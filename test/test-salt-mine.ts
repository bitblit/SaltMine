import { expect } from 'chai';
import {SaltMine} from "../src/salt-mine";
import {SaltMineEntry} from "../src/salt-mine-entry";
import {SaltMineFunction} from '../src/salt-mine-function';

describe('#createEntry', function() {
    it('should make sure a processor exists', function() {
        let a : SaltMineFunction<string> = (entry: SaltMineEntry) : Promise<string> => { return Promise.resolve('a')};
        let b : SaltMineFunction<string> = (entry: SaltMineEntry) : Promise<string> => { return Promise.resolve('b')};

        let fns : SaltMineFunction<any>[] = [a,b];

        let saltMine : SaltMine<any> = new SaltMine(fns,'queue','notificationArn');
        let resultA = saltMine.createEntry('a',{},{});
        let resultC = saltMine.createEntry('c',{},{});
        expect(resultA.type).to.equal('a');
        expect(resultC).to.equal(null);
    });

});