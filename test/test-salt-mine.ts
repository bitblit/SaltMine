import { expect } from 'chai';
import {SaltMine} from "../src/salt-mine";
import {SaltMineProcessor} from "../src/salt-mine-processor";
import {SaltMineEntry} from "../src/salt-mine-entry";

describe('#createEntry', function() {
    it('should make sure a processor exists', function() {
        let a = <SaltMineProcessor>{
            getType: () : string => { return 'a';},
            processEntry : (entry: SaltMineEntry) : Promise<any> => { return Promise.resolve('a')}
        };
        let b = <SaltMineProcessor>{
            getType: () : string => { return 'b';},
            processEntry : (entry: SaltMineEntry) : Promise<any> => { return Promise.resolve('b')}
        };

        let processors : SaltMineProcessor[] = [a,b];

        let saltMine : SaltMine = new SaltMine(processors,'a','b');
        let resultA = saltMine.createEntry('a',{},{});
        let resultC = saltMine.createEntry('c',{},{});
        expect(resultA.type).to.equal('a');
        expect(resultC).to.equal(null);
    });
});