# @unilab/workflow-editor

Uni-Lab 前端唯一的工作流引擎与编辑器，源自 `uni-lab-fe` 当前实现。

该 package 拥有工作流文档、代码编辑、DAG 画布和编辑状态。不得引入
Uni-Lab-Cloud 的 workflow canvas、revision store、canvas controller 或
Redux 状态。不同后端的工作流数据必须先通过 `services`/app adapter 转换为
本 package 的内部模型。
