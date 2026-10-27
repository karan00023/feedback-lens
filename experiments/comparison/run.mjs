import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {hash,compareRuns} from './harness.mjs';

const args=process.argv.slice(2);
if(args.length<4){console.error('Usage: node experiments/comparison/run.mjs DATASET PROMPT OUTPUT RUN [RUN ...]');process.exitCode=1;}
else{
  try{
    const [datasetFile,promptFile,output,...runFiles]=args;
    const [data,prompt,...rawRuns]=await Promise.all([datasetFile,promptFile,...runFiles].map(f=>readFile(f,'utf8')));
    const report=compareRuns(rawRuns.map(JSON.parse),JSON.parse(data),{datasetHash:hash(data),promptHash:hash(prompt)});
    if([datasetFile,promptFile,...runFiles].some(f=>path.resolve(f)===path.resolve(output)))throw new Error('Output must not overwrite an input.');
    await mkdir(path.dirname(path.resolve(output)),{recursive:true});
    await writeFile(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
    console.log(`Saved ${report.runs.length} run(s) to ${output}. Semantic correctness remains unreviewed.`);
  }catch(e){console.error(`Comparison failed: ${e.message}`);process.exitCode=1;}
}
