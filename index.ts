import { createElement } from 'react';
import { registerRootComponent } from 'expo';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import App from './App';

// SafeAreaProvider дает экранам отступы под статус-бар и полоску жестов (Android рисует edge-to-edge).
const Root = () => createElement(SafeAreaProvider, null, createElement(App));

// registerRootComponent calls AppRegistry.registerComponent('main', () => Root);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(Root);
