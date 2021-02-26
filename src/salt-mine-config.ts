import { SaltMineAwsConfig } from './salt-mine-aws-config';
import { SaltMineDevelopmentServerConfig } from './salt-mine-development-server-config';

export interface SaltMineConfig {
  validTypes: string[];

  aws: SaltMineAwsConfig;
  development: SaltMineDevelopmentServerConfig;
}
