const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');

module.exports = {
  entry: './src/assets/js/block_lambda.ts',
  output: {
    filename: 'block_lambda.js',
    path: path.resolve(__dirname, 'docs'),
    // `docs/` is both the published build output and the home of the checked-in
    // `docs/ui-refactor/` design records. Keep those out of the clean sweep, or
    // every build silently deletes tracked documentation.
    clean: {
      keep: /^ui-refactor[\\/]/
    }
  },
  resolve: {
    extensions: ['.ts', '.js']
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: 'ts-loader',
        exclude: /node_modules/
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader']
      }
    ]
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: './src/index.html',
      favicon: './src/assets/images/favicon.svg'
    }),
    new CopyWebpackPlugin({
      patterns: [
        { from: 'src/assets/images', to: 'assets/images' },
        { from: 'src/manifest.webmanifest', to: 'manifest.webmanifest' }
      ]
    })
  ],
  devServer: {
    static: './docs',
    hot: true
    // port: 8080
  }
};
