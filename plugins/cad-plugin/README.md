# CAD Plugin for Dataset Viewer

CAD文件查看插件，为Dataset Viewer应用提供CAD文件格式支持。

## 支持的格式

- **DWG** - AutoCAD图形文件
- **DXF** - 图形交换格式
- **STEP** - 产品数据交换标准 
- **IGES** - 初始图形交换规范

## 功能特性

- 2D/3D图形渲染
- 交互式查看（缩放、旋转、平移）
- 图层管理
- 实体解析和显示
- 响应式设计，支持深色主题

## 安装

在Dataset Viewer的插件管理器中搜索 `@datasetviewer/cad-plugin` 或直接输入包名安装。

## 技术实现

- 基于Canvas 2D渲染
- 支持多种CAD文件格式解析
- 轻量级设计，按需加载
- 完整的TypeScript类型支持

## 开发

```bash
# 安装依赖
npm install

# 开发模式
npm run dev

# 构建
npm run build

# 类型检查
npm run type-check
```

## API

插件遵循Dataset Viewer插件标准，实现了`Plugin`接口。

## 许可证

MIT
