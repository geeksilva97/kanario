# WordPress Setup

## Application Password

Kanario authenticates with the WordPress REST API using [Application Passwords](https://make.wordpress.org/core/2020/11/05/application-passwords-integration-guide/) — built into WordPress since 5.6, no plugins needed.

To create one:

1. Log into WordPress admin (`/wp-admin/`)
2. Go to **Users → Profile**
3. Scroll to the **Application Passwords** section
4. Enter a name (e.g. "Kanario") and click **Add New Application Password**
5. Copy the generated password — it's only shown once

Set the following in your `.env`:

```
WP_URL=https://your-wordpress-site.com
WP_USERNAME=your-wp-username
WP_APP_PASSWORD=xxxx xxxx xxxx xxxx xxxx xxxx
```

> Your user must have **Editor** or **Administrator** role to access draft posts via the REST API.
