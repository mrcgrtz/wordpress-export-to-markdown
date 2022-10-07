// time in ms to wait between requesting image files
// increase this if you see timeouts or server errors
export const image_file_request_delay = 500;

// time in ms to wait between saving Markdown files
// increase this if your file system becomes overloaded
export const markdown_file_write_delay = 25;

// disable this to exclude time from post dates
// for example, "2020-12-25T11:20:35.000Z" would become "2020-12-25"
export const include_time_with_date = true;

// override post date formatting with a custom formatting string (for example: 'yyyy LLL dd')
// tokens are documented here: https://moment.github.io/luxon/docs/manual/formatting.html#table-of-tokens
// if set, this takes precedence over include_time_with_date
export const custom_date_formatting = '';

// categories to be excluded from post frontmatter
// this does not filter out posts themselves, just the categories listed in their frontmatter
export const filter_categories = ['uncategorized'];
