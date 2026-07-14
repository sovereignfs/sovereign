<template>
  <main class="sv-home">
    <section class="sv-hero">
      <div class="sv-shell sv-hero-grid">
        <div class="sv-hero-copy">
          <p class="sv-eyebrow">Open-source workspace runtime</p>
          <h1>Sovereign</h1>
          <p class="sv-hero-lead">Host private, multi-user apps on infrastructure you control.</p>
          <p class="sv-hero-detail">
            Run your own instance, invite users, and install or build the apps your community needs.
            Sovereign provides shared foundations for identity, data, storage, and security, so app
            builders can focus on custom workflows.
          </p>
          <div class="sv-actions" aria-label="Get started with Sovereign">
            <a class="sv-action sv-action-primary" href="/product/">Explore Sovereign</a>
            <a class="sv-action sv-action-secondary" href="/instances">Try an instance</a>
            <a class="sv-action sv-action-link" href="/get-started/operators">Host your own</a>
          </div>
        </div>

        <figure class="sv-workspace-figure">
          <div class="sv-workspace" aria-label="Sovereign workspace with installed apps">
            <div class="sv-workspace-mobile-header" aria-hidden="true">
              <span class="sv-brand-mark">S</span>
              <strong>Sovereign</strong>
              <span class="sv-avatar">A</span>
            </div>
            <aside class="sv-workspace-sidebar" aria-hidden="true">
              <span class="sv-brand-mark">S</span>
              <span class="sv-sidebar-rule"></span>
              <span class="sv-sidebar-app sv-sidebar-app-active">
                <img src="/product/fs.sovereign.launcher.svg" alt="" />
              </span>
              <span class="sv-sidebar-app">
                <img src="/product/fs.sovereign.shopper.svg" alt="" />
              </span>
              <span class="sv-sidebar-app">
                <img src="/product/fs.sovereign.tasks.svg" alt="" />
              </span>
              <span class="sv-sidebar-app">
                <img src="/product/fs.sovereign.plainwrite.svg" alt="" />
              </span>
              <span class="sv-sidebar-spacer"></span>
              <span class="sv-avatar">A</span>
            </aside>
            <div class="sv-workspace-main">
              <header class="sv-workspace-header">
                <div>
                  <strong>Home</strong>
                  <span>Your installed apps and tools.</span>
                </div>
                <span class="sv-search">Search apps</span>
              </header>
              <div class="sv-workspace-label">
                <span>APPS</span>
                <span>4 available</span>
              </div>
              <div class="sv-app-grid">
                <article class="sv-app-tile">
                  <span class="sv-app-icon sv-app-icon-green">
                    <img src="/product/fs.sovereign.shopper.svg" alt="" />
                  </span>
                  <strong>Shopper</strong>
                  <span>Shared lists for everyday shopping.</span>
                </article>
                <article class="sv-app-tile">
                  <span class="sv-app-icon sv-app-icon-yellow">
                    <img src="/product/fs.sovereign.tasks.svg" alt="" />
                  </span>
                  <strong>Tasks</strong>
                  <span>Plan work together in one workspace.</span>
                </article>
                <article class="sv-app-tile">
                  <span class="sv-app-icon sv-app-icon-blue">
                    <img src="/product/fs.sovereign.plainwrite.svg" alt="" />
                  </span>
                  <strong>Plainwrite</strong>
                  <span>A focused place for shared writing.</span>
                </article>
                <article class="sv-app-tile">
                  <span class="sv-app-icon sv-app-icon-coral">
                    <img src="/product/fs.sovereign.account.svg" alt="" />
                  </span>
                  <strong>Account</strong>
                  <span>Profile, security, and data controls.</span>
                </article>
              </div>
            </div>
            <div class="sv-workspace-mobile-nav" aria-hidden="true">
              <span class="sv-mobile-nav-active">
                <img src="/product/fs.sovereign.launcher.svg" alt="" />
              </span>
              <span><img src="/product/fs.sovereign.shopper.svg" alt="" /></span>
              <span><img src="/product/fs.sovereign.tasks.svg" alt="" /></span>
              <span><img src="/product/fs.sovereign.account.svg" alt="" /></span>
            </div>
          </div>
          <figcaption>
            A faithful preview of the Sovereign launcher using current app icons and interface
            patterns.
          </figcaption>
        </figure>
      </div>
    </section>

    <section class="sv-proof" aria-label="Sovereign product principles">
      <div class="sv-shell sv-proof-grid">
        <p><strong>Your infrastructure</strong><span>Deploy and operate one instance.</span></p>
        <p><strong>Your people</strong><span>Invite users into a shared workspace.</span></p>
        <p><strong>Your apps</strong><span>Install what exists or build what is missing.</span></p>
      </div>
    </section>

    <section class="sv-section sv-section-light">
      <div class="sv-shell">
        <div class="sv-section-heading">
          <p class="sv-eyebrow">One runtime, clear responsibilities</p>
          <h2>A workspace your group can shape</h2>
          <p>
            Sovereign handles the platform foundations, so each app can focus on what makes it
            useful.
          </p>
        </div>
        <div class="sv-model-grid">
          <article>
            <span class="sv-step">01</span>
            <h3>Operate an instance</h3>
            <p>Choose the infrastructure, access policy, apps, backups, and upgrade schedule.</p>
          </article>
          <article>
            <span class="sv-step">02</span>
            <h3>Bring people together</h3>
            <p>Users sign in to one workspace and access the apps made available to them.</p>
          </article>
          <article>
            <span class="sv-step">03</span>
            <h3>Extend it for your needs</h3>
            <p>Build a focused app without starting again on identity, data, storage, and UI.</p>
          </article>
        </div>
        <a class="sv-text-link" href="/product/how-it-works">See how Sovereign works</a>
      </div>
    </section>

    <section class="sv-section sv-builder-band">
      <div class="sv-shell sv-builder-grid">
        <div>
          <p class="sv-eyebrow">For app builders</p>
          <h2>Start with the platform already handled</h2>
          <p class="sv-large-copy">
            A Sovereign app is delivered as a plugin and uses stable platform contracts. Your code
            can stay focused on the custom workflow your group actually needs.
          </p>
          <a class="sv-action sv-action-primary" href="/get-started/developers">Build an app</a>
        </div>
        <div class="sv-capability-list" aria-label="Reusable platform foundations">
          <p><span>Available</span><strong>Authentication and sessions</strong></p>
          <p><span>Available</span><strong>App-scoped database access</strong></p>
          <p><span>Available</span><strong>Shared design system and shell</strong></p>
          <p><span>Available</span><strong>Operator-managed app access</strong></p>
          <p>
            <span>In development</span><strong>Expanded storage and encryption services</strong>
          </p>
        </div>
      </div>
    </section>

    <section class="sv-section sv-instance-band">
      <div class="sv-shell sv-instance-grid">
        <div>
          <p class="sv-eyebrow">Use Sovereign</p>
          <h2>Visit a hosted instance</h2>
          <p>
            A Sovereign instance is run by its own operator. Review the operator, access policy, and
            service terms before creating an account or adding data.
          </p>
        </div>
        <div class="sv-instance-entry">
          <div>
            <span class="sv-status sv-status-review">Details pending verification</span>
            <h3>Sovereign on OpenFS</h3>
            <p>Publicly reachable candidate instance. Registration policy is not yet listed.</p>
          </div>
          <a class="sv-action sv-action-secondary" href="/instances">View instance</a>
        </div>
      </div>
    </section>

    <section class="sv-section sv-paths-section">
      <div class="sv-shell">
        <div class="sv-section-heading">
          <p class="sv-eyebrow">Choose your path</p>
          <h2>Start with what you want to do</h2>
        </div>
        <div class="sv-path-grid">
          <a href="/get-started/users">
            <span>Use Sovereign</span>
            <strong>Find a workspace, install it as an app, and enable notifications.</strong>
          </a>
          <a href="/get-started/operators">
            <span>Host Sovereign</span>
            <strong>Evaluate, deploy, and maintain your own instance.</strong>
          </a>
          <a href="/get-started/developers">
            <span>Build an app</span>
            <strong>Create a plugin on Sovereign's shared foundations.</strong>
          </a>
          <a href="/docs/">
            <span>Read the docs</span>
            <strong>Go directly to technical guides and references.</strong>
          </a>
        </div>
      </div>
    </section>
  </main>
</template>
