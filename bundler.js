const fs = require('fs');
const path = require('path');
const { parse } = require('@babel/parser');
const traverse = require('@babel/traverse');
const babel = require('@babel/core');

let ID = 0;

function appendDefaultFileExtension(filePath, extension) {
  const ext = !extension ? 'js' : extension;
  const result = /\.[\w]+$/.test(filePath) ? filePath : `${filePath}.${ext}`;

  return result;
}

function createAsset(filename) {
  const id = ID++;

  const content = fs.readFileSync(filename, 'utf-8');
  const AST = parse(content, {
    sourceType: 'module',
  });
  const dependencies = [];

  traverse.default(AST, {
    ImportDeclaration: ({ node }) => {
      const relativePathWithDefaultExtension = appendDefaultFileExtension(node.source.value);
      dependencies.push(relativePathWithDefaultExtension);
    }
  });

  const { code } = babel.transformFromAst(AST, null, {
    presets: ['@babel/preset-env']
  });

  return {
    id,
    filename,
    dependencies,
    code,
  };
}

function createGraph(entry) {
  const mainAsset = createAsset(entry);
  const queue = [mainAsset]; // 재귀를 사용하는 것보다 큐를 사용하는게 더 적절

  for (const asset of queue) {
    asset.mapping = {};

    const dirname = path.dirname(asset.filename);
    asset.dependencies.forEach(relativePath => {
      const absolutePath = path.join(dirname, relativePath);
      const child = createAsset('./' + absolutePath);

      asset.mapping[relativePath] = child.id;

      queue.push(child);
    });
  }

  return queue;
}

function bundle(graph) {
  let modules = '';

  graph.forEach(mod => {
    modules += `${mod.id}: [
      function (require, module, exports) {
        ${mod.code}
      },
      ${JSON.stringify(mod.mapping)}
    ],`;

    // =>
    // [
    //   fn,
    //   mapping
    // ]
  });

  const result = `
    (function(modules) {
      ${appendDefaultFileExtension.toString()}

      function require(id) {
        const [fn, mapping] = modules[id];

        function localRequire(relativePath) {
          return require(mapping[appendDefaultFileExtension(relativePath)])
        }

        const module = { exports: {} };

        fn(localRequire, module, module.exports);

        return module.exports;
      }

      require(0); // entry 파일을 요청하는 걸로 시작한다.
    })({${modules}});
  `;

  return result
}

const graph = createGraph('./src/entry.js');
const result = bundle(graph);
fs.writeFileSync('./output.js', result);
