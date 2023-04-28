'use strict';

const path = require('path');
const sgmfScripts = require('sgmf-scripts');
const glob = require('glob');

const entryArray = glob.sync('./Cartridges/int_checkoutcom_sfra/cartridge/client/**/*.js');
const entryObject = entryArray.reduce((acc, item) => {
  const name = item.replace('./Cartridges/int_checkoutcom_sfra/cartridge/client/', '').replace('.js', '');
  acc[name] = item;
  return acc;
}, {});

module.exports = {
  mode: 'production',
  name: 'js',
  entry: entryObject,
  output: {
    path: path.resolve(__dirname, 'Cartridges/int_checkoutcom_sfra/cartridge/static'),
    filename: '[name].js'
  },
  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: ['@babel/preset-env']
          }
        }
      }
    ]
  },
  resolve: {
    alias: {
      base: path.resolve(__dirname, '../../storefront-reference-architecture-6.0.0/cartridges/app_storefront_base/cartridge/client/default/js'),
    },
  },
};
