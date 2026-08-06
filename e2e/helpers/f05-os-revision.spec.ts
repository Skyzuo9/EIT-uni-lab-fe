import { expect, test } from "@playwright/test";

import {
  F05_DEFAULT_OS_REVISION,
  resolveExpectedF05OsRevision,
} from "./f05-os-revision";

test("未配置覆盖值时固定使用已审定 OS 产品基线", usesReviewedDefault);
test("显式完整 SHA 可以选择待验收 OS 候选", usesExplicitRevision);
test("空值与脏修订值必须关闭失败", rejectsDirtyRevision);

/**
 * 证明默认期望修订仍固定到已经审定的 OS 产品基线。
 *
 * 参数：无。返回：无。断言：空环境对象解析为既有完整 SHA。
 * 异常：解析器改变默认产品基线时断言失败。
 */
function usesReviewedDefault(): void {
  expect(resolveExpectedF05OsRevision({})).toBe(
    "cd17e040ea7bfe4070a556f5a9576d7ce42433f3",
  );
  expect(F05_DEFAULT_OS_REVISION).toBe(
    "cd17e040ea7bfe4070a556f5a9576d7ce42433f3",
  );
}

/**
 * 证明显式环境变量可选择一个精确、干净的候选提交。
 *
 * 参数：无。返回：无。断言：完整小写 Git SHA 原样返回。
 * 异常：覆盖值被忽略、裁剪或改写时断言失败。
 */
function usesExplicitRevision(): void {
  // ``candidateRevision`` 是本轮真实 OS 候选的稳定 Git 提交身份。
  const candidateRevision = "263b176d4e8e081d58654bd13c12921560c9ac25";
  expect(
    resolveExpectedF05OsRevision({
      UNILAB_AUTHORING_OS_REVISION: candidateRevision,
    }),
  ).toBe(candidateRevision);
}

/**
 * 证明空白、短值、大小写漂移和非十六进制修订均不能放宽精确校验。
 *
 * 参数：无。返回：无。断言：每个脏值都抛出带环境变量名称的错误。
 * 异常：任一脏值被接受时断言失败。
 */
function rejectsDirtyRevision(): void {
  // ``dirtyRevisions`` 是不得被 trim、补全或当作任意修订接受的输入全集。
  const dirtyRevisions = [
    "",
    " ",
    "263b176d",
    "263B176D4E8E081D58654BD13C12921560C9AC25",
    "g63b176d4e8e081d58654bd13c12921560c9ac25",
    " 263b176d4e8e081d58654bd13c12921560c9ac25",
  ];
  for (const dirtyRevision of dirtyRevisions) {
    /**
     * 尝试解析当前不可信修订字符串。
     *
     * @returns 仅在门禁错误接受输入时返回修订。
     * @throws 预期抛出带环境变量名称的校验错误。
     */
    function resolveDirtyRevision(): string {
      return resolveExpectedF05OsRevision({
        UNILAB_AUTHORING_OS_REVISION: dirtyRevision,
      });
    }
    expect(resolveDirtyRevision).toThrow(/UNILAB_AUTHORING_OS_REVISION/);
  }
}
