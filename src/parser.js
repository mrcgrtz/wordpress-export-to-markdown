import fs from 'node:fs';
import { DateTime } from 'luxon';
import xml2js from 'xml2js';

import * as shared from './shared.js';
import * as settings from './settings.js';
import * as translator from './translator.js';

async function parseFilePromise(config) {
	console.log('\nParsing...');
	const content = await fs.promises.readFile(config.input, 'utf8');
	const data = await xml2js.parseStringPromise(content, {
		trim: true,
		tagNameProcessors: [xml2js.processors.stripPrefix]
	});

	const postTypes = getPostTypes(data, config);
	const posts = collectPosts(data, postTypes, config);

	const images = [];
	if (config.saveAttachedImages) {
		images.push(...collectAttachedImages(data));
	}
	if (config.saveScrapedImages) {
		images.push(...collectScrapedImages(data, postTypes));
	}

	mergeImagesIntoPosts(images, posts);

	return posts;
}

function getPostTypes(data, config) {
	if (config.includeOtherTypes) {
		// search export file for all post types minus some default types we don't want
		// effectively this will be 'post', 'page', and custom post types
		const types = data.rss.channel[0].item
			.map(item => item.post_type[0])
			.filter(type => !['attachment', 'revision', 'nav_menu_item', 'custom_css', 'customize_changeset'].includes(type));
		return [...new Set(types)]; // remove duplicates
	} else {
		// just plain old vanilla "post" posts
		return ['post'];
	}
}

function getItemsOfType(data, type) {
	return data.rss.channel[0].item.filter(item => item.post_type[0] === type);
}

function collectPosts(data, postTypes, config) {
	// this is passed into getPostContent() for the markdown conversion
	const turndownService = translator.initTurndownService();

	let allPosts = [];
	postTypes.forEach(postType => {
		const postsForType = getItemsOfType(data, postType)
			.filter(post => post.status[0] !== 'trash' && post.status[0] !== 'draft')
			.map(post => ({
				// meta data isn't written to file, but is used to help with other things
				meta: {
					id: getPostId(post),
					slug: getPostSlug(post),
					coverImageId: getPostCoverImageId(post),
					type: postType,
					imageUrls: []
				},
				frontmatter: {
					title: getPostTitle(post),
					date: getPostDate(post),
					categories: getCategories(post),
					tags: getTags(post),
					geo: getGeo(post),
					syndication: getSyndicationLinks(post),
					slug: getPostSlug(post)
				},
				content: translator.getPostContent(post, turndownService, config)
			}));

		if (postTypes.length > 1) {
			console.log(`${postsForType.length} "${postType}" posts found.`);
		}

		allPosts.push(...postsForType);
	});

	if (postTypes.length === 1) {
		console.log(allPosts.length + ' posts found.');
	}
	return allPosts;
}

function getPostId(post) {
	return post.post_id[0];
}

function getPostSlug(post) {
	return decodeURIComponent(post.post_name[0]);
}

function getPostCoverImageId(post) {
	if (post.postmeta === undefined) {
		return undefined;
	}

	const postmeta = post.postmeta.find(postmeta => postmeta.meta_key[0] === '_thumbnail_id');
	const id = postmeta ? postmeta.meta_value[0] : undefined;
	return id;
}

function getPostTitle(post) {
	return post.title[0];
}

function getPostDate(post) {
	const dateTime = DateTime.fromRFC2822(post.pubDate[0], { zone: 'utc' });

	if (settings.custom_date_formatting) {
		return dateTime.toFormat(settings.custom_date_formatting);
	} else if (settings.include_time_with_date) {
		return dateTime.toISO();
	} else {
		return dateTime.toISODate();
	}
}

function getGeo(post) {
	if (post.postmeta === undefined) {
		return undefined;
	}

	const [latitude, longitude, altitude, accuracy, place] = [
		'geo_latitude',
		'geo_longitude',
		'geo_altitude',
		'geo_accuracy',
		'mf2_place_name',
	].map(field => {
		const postmeta = post.postmeta.find(postmeta => postmeta.meta_key[0] === field);
		return postmeta ? postmeta.meta_value[0] : undefined;
	});

	if (latitude && longitude) {
		if (latitude === '0' && longitude === '0') {
			// remove data for '0,0' coordinates which are false inputs
			return undefined;
		}

		let geoUrl = `geo:${latitude},${longitude}`;
		geoUrl += altitude ? `,${altitude}` : '';
		geoUrl += accuracy ? `;u=${accuracy}` : '';

		if (place && place.includes('"')) {
			// this is a PHP serialized array with just 1 item, so we can apply a simple RegEx here
			const [, placeName] = /"(.+)"/.exec(place);
			geoUrl += `?text=${encodeURIComponent(placeName)}`;
		}

		return geoUrl;
	}

	return undefined;
}

function getSyndicationLinks(post) {
	const postmeta = post.postmeta?.find(postmeta => postmeta.meta_key[0] === 'mf2_syndication');

	if (postmeta?.meta_value?.[0]) {
		const matches = [...postmeta.meta_value[0].matchAll(/"(.*?)"/g)];
		return matches.map(([, url]) => url);
	}

	return undefined;
}

function getCategories(post) {
	const categories = processCategoryTags(post, 'category');
	return categories.filter(category => !settings.filter_categories.includes(category));
}

function getTags(post) {
	return processCategoryTags(post, 'post_tag');
}

function processCategoryTags(post, domain) {
	if (!post.category) {
		return [];
	}

	return post.category
		.filter(category => category.$.domain === domain)
		.map(({ $: attributes }) => decodeURIComponent(attributes.nicename));
}

function collectAttachedImages(data) {
	const images = getItemsOfType(data, 'attachment')
		// filter to certain image file types
		.filter(attachment => (/\.(gif|jpe?g|png)$/i).test(attachment.attachment_url[0]))
		.map(attachment => ({
			id: attachment.post_id[0],
			postId: attachment.post_parent[0],
			url: attachment.attachment_url[0]
		}));

	console.log(images.length + ' attached images found.');
	return images;
}

function collectScrapedImages(data, postTypes) {
	const images = [];
	postTypes.forEach(postType => {
		getItemsOfType(data, postType).forEach(post => {
			const postId = post.post_id[0];
			const postContent = post.encoded[0];
			const postLink = post.link[0];

			const matches = [...postContent.matchAll(/<img[^>]*src="(.+?\.(?:gif|jpe?g|png))"[^>]*>/gi)];
			matches.forEach(match => {
				// base the matched image URL relative to the post URL
				const url = new URL(match[1], postLink).href;
				images.push({
					id: -1,
					postId: postId,
					url
				});
			});
		});
	});

	console.log(images.length + ' images scraped from post body content.');
	return images;
}

function mergeImagesIntoPosts(images, posts) {
	images.forEach(image => {
		posts.forEach(post => {
			let shouldAttach = false;

			// this image was uploaded as an attachment to this post
			if (image.postId === post.meta.id) {
				shouldAttach = true;
			}

			// this image was set as the featured image for this post
			if (image.id === post.meta.coverImageId) {
				shouldAttach = true;
				post.frontmatter.coverImage = shared.getFilenameFromUrl(image.url);
			}

			if (shouldAttach && !post.meta.imageUrls.includes(image.url)) {
				post.meta.imageUrls.push(image.url);
			}
		});
	});
}

export { parseFilePromise };
