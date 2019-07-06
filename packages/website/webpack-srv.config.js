const path = require("path");

module.exports = {
  mode: 'development',
  entry: {
    index: './dist/server.js',
  },
  output: {
    filename: 'server.js',
    path: path.resolve(__dirname)
  },
  resolve: {
    // Add `.ts` and `.tsx` as a resolvable extension.
    extensions: ['.js', '.json']
  },
  target: 'node'
};

