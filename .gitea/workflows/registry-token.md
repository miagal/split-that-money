# Gitea registry token

`.gitea/workflows/docker-build.yaml` pushes images to this Gitea's container registry. The built-in job token cannot publish packages. Create a personal access token and store it as the Actions secret `REGISTRY_TOKEN`.

Create the token on the same account that starts the workflow. That account must be allowed to publish packages for the repository owner. Paste the token only into the secret. Do not commit it.

Gitea runs only the workflows in this folder. `.github/workflows/docker-build.yaml` still runs on GitHub, not here.

## 1. Enable Actions

Open the repository, then Settings, then Actions. Enable Repository Actions.

## 2. Create the token

1. Open User Settings, then Applications, then Generate New Token.
   Path: `/user/settings/applications`
2. Name it, for example `split-that-money-registry`.
3. Under Select permissions, set package to Read and Write (`write:package`).
4. Generate the token and copy it. Gitea shows it once.

## 3. Store the secret

1. Open the repository -> `Settings` -> `Actions` -> `Secrets`.
2. Add a secret named `REGISTRY_TOKEN`.
3. Paste the token as the value.

Do not name the secret `GITEA_TOKEN` or `GITHUB_TOKEN`. Those names are reserved, and the job token still cannot push packages.

## 4. Runner

This workflow uses `runs-on: ubuntu-latest`. That matches the label name in the compose snippet. The image does not.

`gitea/runner:3` has no Docker daemon. `node:20-bookworm` has no Docker client, so the build steps fail there. Mount the host socket into the runner, and point the same label at an image that already has a Docker client. Default runner config mounts that socket into the job. A job that can use the host socket can also control the host Docker daemon.

```yaml
runner:
  image: docker.io/gitea/runner:3
  restart: always
  environment:
    CONFIG_FILE: /config.yaml
    GITEA_INSTANCE_URL: "http://gitea:3000"
    GITEA_RUNNER_REGISTRATION_TOKEN:
    GITEA_RUNNER_NAME: "docker-runner"
    GITEA_RUNNER_LABELS: "ubuntu-latest:docker://docker.gitea.com/runner-images:ubuntu-latest"
  volumes:
    - ./config.yaml:/config.yaml
    - /var/run/docker.sock:/var/run/docker.sock
```

In that `config.yaml`, set `runner.capacity` to at least `2`, then restart the runner. Capacity `1` still builds both images, but one waits for the other.

Image pushes use Gitea's public server URL, not `http://gitea:3000`. The host Docker daemon must be able to reach that URL. `actions/checkout` is downloaded from github.com unless the instance sets `[actions].DEFAULT_ACTIONS_URL` to `self`.

Packages must be enabled on the instance. If Packages is missing in the UI, an admin sets `[packages] ENABLED = true`.

## 5. Run

Actions, then Manual Split That Money Build, then Run workflow. Choose patch, minor, or major.

After both pushes succeed, the workflow creates a git tag and a Gitea release. Images:

- `{host}/{owner}/split-that-money/backend:{version}`
- `{host}/{owner}/split-that-money/frontend:{version}`

Both also get a `latest` tag.
