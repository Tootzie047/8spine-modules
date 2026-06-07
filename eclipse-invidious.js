var _INSTANCES = [
'https://inv.thepixora.com',
'https://invidious.privacydev.net',
'https://iv.melmac.space'
];
var _instanceIndex = 0;

function _getBase(context) {
if (context && context.settings && context.settings.customInstance && context.settings.customInstance.value) {
return context.settings.customInstance.value.trim().replace(/\/$/, '');
}
return _INSTANCES[_instanceIndex % _INSTANCES.length];
}

async function _fetchWithFallback(path, context) {
for (var i = 0; i < _INSTANCES.length; i++) {
var base = context && context.settings && context.settings.customInstance && context.settings.customInstance.value
? context.settings.customInstance.value.trim().replace(/\/$/, '')
: _INSTANCES[(_instanceIndex + i) % _INSTANCES.length];
try {
var r = await fetch(base + path, { headers: { 'Accept': 'application/json' } });
if (!r.ok) throw new Error('HTTP ' + r.status);
_instanceIndex = (_instanceIndex + i) % _INSTANCES.length;
return await r.json();
} catch(e) {
console.warn('[Eclipse/eclipse-invidious] Instance ' + base + ' failed: ' + e.message);
if (context && context.settings && context.settings.customInstance && context.settings.customInstance.value) break;
}
}
throw new Error('[Eclipse/eclipse-invidious] All instances failed.');
}

async function searchTracks(query, limit, context) {
var lim = limit || 20;
try {
var data = await _fetchWithFallback(
'/api/v1/search?q=' + encodeURIComponent(query) + '&type=video&fields=videoId,title,author,lengthSeconds,videoThumbnails',
context
);
var tracks = (Array.isArray(data) ? data : []).slice(0, lim).map(function(item) {
var thumb = (item.videoThumbnails || []).find(function(t) { return t.quality === 'medium'; });
return {
id: item.videoId,
title: item.title || 'Unknown',
artist: item.author || 'Unknown Artist',
album: 'YouTube',
duration: item.lengthSeconds || 0,
albumCover: (thumb || (item.videoThumbnails || [])[0] || {}).url || ''
};
});
return { tracks: tracks, total: tracks.length };
} catch(e) {
console.error('[Eclipse/eclipse-invidious] Search error:', e.message);
return { tracks: [], total: 0 };
}
}

async function getTrackStreamUrl(trackId, quality, context) {
try {
var data = await _fetchWithFallback(
'/api/v1/videos/' + encodeURIComponent(trackId) + '?fields=adaptiveFormats,formatStreams',
context
);
var formats = (data.adaptiveFormats || []).concat(data.formatStreams || []);
var audioOnly = formats.filter(function(f) {
return f.type && f.type.startsWith('audio/');
});
audioOnly.sort(function(a, b) { return (b.bitrate || 0) - (a.bitrate || 0); });
var chosen = quality === 'LOW'
? audioOnly[audioOnly.length - 1]
: audioOnly[0];
if (!chosen) chosen = formats[0];
if (!chosen || !chosen.url) throw new Error('No stream found');
var aq = (chosen.bitrate || 0) > 192000 ? 'HIGH' : 'LOW';
return { streamUrl: chosen.url, track: { id: trackId, audioQuality: aq } };
} catch(e) {
console.error('[Eclipse/eclipse-invidious] Stream error:', e.message);
return { streamUrl: null, track: { id: trackId, audioQuality: 'HIGH' } };
}
}

async function getAlbum(playlistId, context) {
try {
var data = await _fetchWithFallback('/api/v1/playlists/' + encodeURIComponent(playlistId), context);
var tracks = (data.videos || []).map(function(v) {
return {
id: v.videoId,
title: v.title || 'Unknown',
artist: v.author || data.author || 'Unknown',
album: data.title || '',
duration: v.lengthSeconds || 0,
albumCover: ((v.videoThumbnails || [])[0] || {}).url || ''
};
});
return {
album: { id: playlistId, title: data.title || 'Unknown', artist: data.author || 'Unknown', cover: ((data.authorThumbnails || [])[0] || {}).url || '' },
tracks: tracks
};
} catch(e) { return { album: null, tracks: [] }; }
}

async function getArtist(channelId, context) {
try {
var data = await _fetchWithFallback('/api/v1/channels/' + encodeURIComponent(channelId), context);
var latestVideos = (data.latestVideos || []).map(function(v) {
return {
id: v.videoId,
title: v.title || 'Unknown',
artist: data.author || 'Unknown',
album: '',
duration: v.lengthSeconds || 0,
albumCover: ((v.videoThumbnails || [])[0] || {}).url || ''
};
});
return {
artist: { id: channelId, name: data.author || 'Unknown', cover: ((data.authorThumbnails || [])[0] || {}).url || '' },
tracks: latestVideos,
albums: []
};
} catch(e) { return { artist: null, tracks: [], albums: [] }; }
}

return {
id: "eclipse-invidious",
name: "Invidious (YouTube)",
version: "1.0.1",
labels: ["YOUTUBE", "FREE", "NO-AUTH"],
settings: {
"customInstance": {
"type": "text",
"label": "Custom Invidious Instance (Optional)",
"description": "Enter a custom Invidious instance URL (e.g. https://invidious.example.com). Leave blank to use defaults.",
"defaultValue": ""
}
},
searchTracks: searchTracks,
getTrackStreamUrl: getTrackStreamUrl,
getAlbum: getAlbum,
getArtist: getArtist
};
