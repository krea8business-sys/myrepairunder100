// Monorepo: let Metro see the shared kit in /packages/mobile-kit while resolving
// node_modules from this app (so react / react-native are never duplicated).
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const kit = path.resolve(projectRoot, '../../packages/mobile-kit');
const config = getDefaultConfig(projectRoot);
config.watchFolders = [kit];
config.resolver.nodeModulesPaths = [path.resolve(projectRoot, 'node_modules')];
config.resolver.disableHierarchicalLookup = true;
module.exports = config;
