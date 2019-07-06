const path = require("path");

module.exports = {
  mode: 'development',
  entry: {
    index: './dist/index.js',
  },
  output: {
    filename: 'app.js',
    path: path.resolve(__dirname, 'public')
  },
  resolve: {
    // Add `.ts` and `.tsx` as a resolvable extension.
    extensions: ['.js', '.json', '.jsx']
  },
  target: 'web'
};

