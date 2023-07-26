import * as github from "@actions/github";
import {
  createBranch,
  getBranch,
  merge,
  updateBranchSha,
} from "./github-api/branch";
import * as core from "@actions/core";
import { createCommit, getCommit } from "./github-api/commit";
import { createPullRequest, getPullRequestByCommit } from "./github-api/pr";

export const updateRelease = async () => {
  const pr = await getPullRequestByCommit(github.context.sha);
  const choreBranchName = `chore/hotfix-merge-${pr.number}`;

  const devBranch = await getBranch("dev");

  if (!devBranch) {
    throw new Error("Dev branch not resolved");
  }

  await createBranch(choreBranchName, devBranch.commit.sha);
  const newBranch = await getBranch(choreBranchName);

  if (!newBranch) {
    throw new Error(`Branch ${choreBranchName} not resolved`);
  }

  const branchSha = newBranch.commit.sha;
  const branchTree = newBranch.commit.commit.tree.sha;
  core.info(
    `Created branch ${choreBranchName} (sha: ${branchSha}, tree: ${branchTree})`
  );

  const commit = await getCommit(github.context.sha);
  const parentSha = commit.parents[0].sha;
  const tempCommit = await createCommit(branchTree, parentSha, "temp");

  core.info(`Created temp commit ${tempCommit.sha} (parent: ${parentSha})`);

  await updateBranchSha(choreBranchName, tempCommit.sha);

  const mergeOp = await merge(commit.sha, choreBranchName);
  const mergeTreeSha = mergeOp.commit.tree.sha;

  const cherry = await createCommit(mergeTreeSha, branchSha, "looks good!");

  await updateBranchSha(choreBranchName, cherry.sha);

  // when creating the release PR, the push gets triggered,
  // but at that point we should not create a dev PR as there is no commit difference
  if (devBranch.commit.sha === commit.sha) {
    return;
  }

  await createPullRequest(
    choreBranchName,
    "dev",
    `chore(release): Merge release fix ${pr.number} to dev`,
    pr.body ?? commit.message
  );
};
