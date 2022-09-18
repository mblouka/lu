
import { Statement } from './parser';

export interface Function {
    stats: Statement[];
    vararg: boolean;
    args: string[];
}

export default Function;