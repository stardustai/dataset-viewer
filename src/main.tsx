import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// 为插件系统全局暴露依赖
declare global {
  interface Window {
    React: any;
    ReactDOM: any;
  }
}

// 暴露 React 和 ReactDOM 给插件使用
window.React = React;
window.ReactDOM = ReactDOM;

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
