import { expect } from 'chai';
import {SaltMine} from "../src/salt-mine";
import {SaltMineProcessor} from "../src/salt-mine-processor";
import {SaltMineEntry} from "../src/salt-mine-entry";
import {EchoProcessor} from '../src/echo-processor';

describe('#createEntry', function() {
    it('should make sure a processor exists', function() {
        let a = <SaltMineProcessor>{
            getSaltMineType: () : string => { return 'a';},
            processEntry : (entry: SaltMineEntry) : Promise<any> => { return Promise.resolve('a')}
        };
        let b = <SaltMineProcessor>{
            getSaltMineType: () : string => { return 'b';},
            processEntry : (entry: SaltMineEntry) : Promise<any> => { return Promise.resolve('b')}
        };

        let processors : SaltMineProcessor[] = [a,b];

        let saltMine : SaltMine = new SaltMine(processors,'a','b');
        let resultA = saltMine.createEntry('a',{},{});
        let resultC = saltMine.createEntry('c',{},{});
        expect(resultA.type).to.equal('a');
        expect(resultC).to.equal(null);
    });

    it('should filter a list of items down to just the processors', function() {
        const echo:EchoProcessor = new EchoProcessor();
        const items:any[] = [{'test':'blah'}, echo, {'test2':'blah2'}];
        const filtered:SaltMineProcessor[] = SaltMine.findProcessors(items);

        expect(filtered.length).to.equal(1);
        expect(filtered[0]).to.equal(echo);
    });
});