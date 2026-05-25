update the vite setup so that the webapp is served from /flexo/

also the production site will have a base of `https://meow.science.fail` with the full URI at `https://meow.science.fail/flexo/`

add a github actions which will:

1. clone repo `git@github.com:meow-sci/flexo-private-assets.git` to .tmp/flexo-private-assets
2. setup the env for the CI build to include a KSA_ASSETS_DIR env dir which will point to that checked out repo with a /assets subfolder, for example (pseudo) `$CI_PROJECT_DIR/.tmp/flexo-private-assets/assets`, because the repo has a /assets folder that contain the assets
3. do the project build with an pnpm install, pnpm run build
4. do the pages deploy

here's an example github actions `.github/workflows/deploy.yml` from a similar project that is doing an astro site build at the same domain but under `/pebkac/` as the path, you can use this as a reference only if anything is helpful (or not if its not helpful)



```yml
name: Deploy to GitHub Pages

on:
  # Trigger the workflow every time you push to the `main` branch
  # Using a different branch name? Replace `main` with your branch’s name
  push:
    branches: [ main ]
  # Allows you to run this workflow manually from the Actions tab on GitHub.
  workflow_dispatch:

# Allow this job to clone the repo and create a page deployment
permissions:
  contents: read
  pages: write
  id-token: write

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout your repository using git
        uses: actions/checkout@v5
      - name: Install, build, and upload your site
        uses: withastro/action@v5
        with:
          # path: . # The root location of your Astro project inside the repository. (optional)
          node-version: 24
          # package-manager: pnpm@latest # The Node package manager that should be used to install dependencies and build your site. Automatically detected based on your lockfile. (optional)
          # build-cmd: pnpm run build # The command to run to build your site. Runs the package build script/task by default. (optional)
        # env:
          # PUBLIC_POKEAPI: 'https://pokeapi.co/api/v2' # Use single quotation marks for the variable value. (optional)

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4
````