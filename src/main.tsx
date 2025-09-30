import React, { StrictMode } from 'react';
import { Fragment, jsx, jsxs } from 'react/jsx-runtime';
import ReactDOM from 'react-dom/client';
import App from './App';
import { registerBuiltInViewers } from './services/plugin/builtInViewers';

// 为插件系统全局暴露依赖
declare global {
  interface Window {
    React: any;
    ReactDOM: any;
    ReactJSXRuntime: any;
  }
}

// 暴露 React 和 ReactDOM 给插件使用
window.React = React;
window.ReactDOM = ReactDOM;

// 暴露 React JSX Runtime 给插件使用
window.ReactJSXRuntime = {
  jsx,
  jsxs,
  Fragment,
};

// 注册所有内置查看器
registerBuiltInViewers();

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>
);
