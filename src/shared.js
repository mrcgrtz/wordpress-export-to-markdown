function getFilenameFromUrl(url) {
	return decodeURIComponent(url.split('/').slice(-1)[0]);
}

export { getFilenameFromUrl };
