import GtfsRealtimeBindings from 'gtfs-realtime-bindings';

export default {
  async fetch(request, env, ctx) {
    // Read the stop ID from the URL parameters (e.g., ?stop=8220DB000002)
    // If no parameter is provided, it defaults to a placeholder stop ID
    const urlObj = new URL(request.url);
    const targetStopId = urlObj.searchParams.get('stop') || '8220DB000002';

    // The NTA v2 Trip Updates endpoint
    const ntaUrl = 'https://api.nationaltransport.ie/gtfsr/v2/TripUpdates';
    
    // Fetch the binary data securely using your hidden API key
    const response = await fetch(ntaUrl, {
      headers: {
        'x-api-key': env.NTA_API_KEY
      }
    });

    if (!response.ok) {
      return new Response(JSON.stringify({ error: 'Failed to fetch from NTA API' }), { 
        status: response.status,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const buffer = await response.arrayBuffer();
    
    // Decode the Protocol Buffers binary into a readable object
    const feed = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(new Uint8Array(buffer));
    
    let incomingBuses = [];

    // Search the feed for the specific stop ID
    feed.entity.forEach((entity) => {
      if (entity.tripUpdate && entity.tripUpdate.stopTimeUpdate) {
        entity.tripUpdate.stopTimeUpdate.forEach((stopUpdate) => {
          if (stopUpdate.stopId === targetStopId) {
             incomingBuses.push({
               routeId: entity.tripUpdate.trip.routeId,
               delaySeconds: stopUpdate.arrival?.delay || 0,
               // Convert Unix timestamp to a readable time format
               arrivalTime: stopUpdate.arrival?.time?.low 
                 ? new Date(stopUpdate.arrival.time.low * 1000).toLocaleTimeString('en-IE', { timeZone: 'Europe/Dublin' }) 
                 : 'Unknown'
             });
          }
        });
      }
    });

    // Return the clean JSON structure for your SenseCraft dashboard
    return Response.json({
        stopId: targetStopId,
        buses: incomingBuses
    });
  }
};
