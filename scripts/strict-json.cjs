// JSON.parse validates syntax; this second lexical walk rejects duplicate object
// keys (including escaped spellings) rather than silently taking the last owner.
function parseStrictJson(bytes){
  const source=String(bytes),value=JSON.parse(source),tokens=source.match(/"(?:\\.|[^"\\])*"|[{}\[\]:,]|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null/g)||[];
  let cursor=0;
  function visit(){
    const token=tokens[cursor++];
    if(token==='{'){
      const keys=new Set();if(tokens[cursor]==='}'){cursor++;return;}
      while(true){const key=JSON.parse(tokens[cursor++]);if(keys.has(key))throw Error(`Duplicate JSON key: ${key}`);keys.add(key);cursor++;visit();if(tokens[cursor++]==='}')break;}
    }else if(token==='['){if(tokens[cursor]===']'){cursor++;return;}while(true){visit();if(tokens[cursor++]===']')break;}}
  }
  visit();return value;
}
module.exports={parseStrictJson};
