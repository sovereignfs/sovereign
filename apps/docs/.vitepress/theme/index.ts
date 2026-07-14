import DefaultTheme from 'vitepress/theme';
import '@fontsource/hanken-grotesk/latin-400.css';
import '@fontsource/hanken-grotesk/latin-500.css';
import '@fontsource/hanken-grotesk/latin-600.css';
import '@fontsource/hanken-grotesk/latin-700.css';
import './custom.css';
import './home.css';
import Layout from './Layout.vue';

export default {
  extends: DefaultTheme,
  Layout,
};
