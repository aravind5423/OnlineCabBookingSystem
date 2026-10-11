// public/js/sidebar.js — Dynamic sidebar builder for each role
function buildSidebar(role, activePage) {
    const navItems = {
        passenger: [
            { icon: '📊', label: 'Dashboard',    href: '/passenger/dashboard.html' },
            { icon: '🚖', label: 'Book a Ride',  href: '/passenger/book-ride.html' },
            { icon: '🔴', label: 'Active Trip',  href: '/passenger/active-trip.html' },
            { icon: '📋', label: 'Trip History', href: '/passenger/trip-history.html' },
            { icon: '👤', label: 'My Profile',   href: '/passenger/profile.html' },
        ],
        driver: [
            { icon: '📊', label: 'Dashboard',     href: '/driver/dashboard.html' },
            { icon: '📬', label: 'Ride Requests', href: '/driver/ride-requests.html' },
            { icon: '🚦', label: 'Active Trip',   href: '/driver/active-trip.html' },
            { icon: '🚗', label: 'My Vehicles',   href: '/driver/vehicles.html' },
            { icon: '💰', label: 'Earnings',      href: '/driver/earnings.html' },
            { icon: '👤', label: 'My Profile',    href: '/driver/profile.html' },
        ],
        admin: [
            { icon: '📊', label: 'Dashboard',          href: '/admin/dashboard.html' },
            { icon: '👥', label: 'Passengers',          href: '/admin/manage-passengers.html' },
            { icon: '🚗', label: 'Drivers',             href: '/admin/manage-drivers.html' },
            { icon: '🚘', label: 'Vehicles',            href: '/admin/manage-vehicles.html' },
            { icon: '🗺️', label: 'Trips',              href: '/admin/manage-trips.html' },
            { icon: '💲', label: 'Fare Rules',          href: '/admin/fare-rules.html' },
            { icon: '📈', label: 'Reports',             href: '/admin/reports.html' },
            { icon: '👤', label: 'My Profile',          href: '/admin/profile.html' },
        ],
        superadmin: [
            { icon: '📊', label: 'Dashboard',       href: '/superadmin/dashboard.html' },
            { icon: '⚙️', label: 'Manage Admins',   href: '/superadmin/manage-admins.html' },
            { icon: '🔐', label: 'Permissions',     href: '/superadmin/permissions.html' },
            { icon: '📋', label: 'System Logs',     href: '/superadmin/system-logs.html' },
            { icon: '🛠️', label: 'Settings',        href: '/superadmin/system-settings.html' },
            // Plus all admin links
            { icon: '👥', label: 'Passengers',      href: '/admin/manage-passengers.html' },
            { icon: '🚗', label: 'Drivers',         href: '/admin/manage-drivers.html' },
            { icon: '💲', label: 'Fare Rules',      href: '/admin/fare-rules.html' },
            { icon: '📈', label: 'Reports',         href: '/admin/reports.html' },
            { icon: '👤', label: 'My Profile',      href: '/superadmin/profile.html' },
        ]
    };

    const roleColors = {
        passenger: 'blue', driver: 'amber', admin: 'green', superadmin: 'purple'
    };
    const roleLabels = {
        passenger: 'Passenger Portal', driver: 'Driver Portal',
        admin: 'Admin Panel', superadmin: 'Super Admin'
    };

    const items = navItems[role] || [];
    const current = window.location.pathname;

    const html = `
    <aside class="sidebar" id="sidebar">
      <a href="/" class="sidebar-logo">
        <div class="sidebar-logo-icon">🚖</div>
        <div class="sidebar-logo-text">Cab<span>Go</span></div>
      </a>

      <div class="sidebar-section">
        <div class="sidebar-section-label">${roleLabels[role]}</div>
        ${items.map(item => `
          <a href="${item.href}"
             class="nav-link${current === item.href || current.endsWith(item.href.split('/').pop()) ? ' active' : ''}">
            <span class="nav-icon">${item.icon}</span>
            <span>${item.label}</span>
          </a>`).join('')}
      </div>

      <div class="sidebar-footer">
        <div class="sidebar-user">
          <div class="sidebar-avatar" id="sidebar-avatar">U</div>
          <div class="sidebar-user-info">
            <div class="sidebar-user-name" id="sidebar-user-name">Loading...</div>
            <div class="sidebar-user-role" id="sidebar-user-role">${role}</div>
          </div>
        </div>
        <button class="btn btn-ghost btn-sm w-full" style="margin-top:var(--space-3)" data-logout>
          🚪 Logout
        </button>
      </div>
    </aside>

    <header class="topbar" id="topbar">
      <button id="sidebar-toggle" class="btn btn-ghost btn-icon" style="display:none">☰</button>
      <div class="topbar-left">
        <h2 id="page-title">${activePage || 'Dashboard'}</h2>
        <p id="page-subtitle" style="font-size:0.8rem;color:var(--text-muted)"></p>
      </div>
      <div class="topbar-right">
        <span class="badge badge-${roleColors[role]||'blue'}" style="font-size:0.75rem">${roleLabels[role]}</span>
      </div>
    </header>`;

    document.body.insertAdjacentHTML('afterbegin', html);

    // Show menu toggle on mobile
    if (window.innerWidth <= 768) {
        document.getElementById('sidebar-toggle').style.display = 'flex';
    }
    window.addEventListener('resize', () => {
        const toggle = document.getElementById('sidebar-toggle');
        if (toggle) toggle.style.display = window.innerWidth <= 768 ? 'flex' : 'none';
    });
}

window.buildSidebar = buildSidebar;
