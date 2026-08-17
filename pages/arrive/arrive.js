const { RESTAURANT } = require('../../utils/data.js');
const { parseArriveQuery, shareMessage, openRestaurantMap, callRestaurant } = require('../../utils/share.js');
const { track, pageView, pageHide } = require('../../utils/track.js');

Page({
  data: {
    restaurant: RESTAURANT,
    booking: {},
    hasBooking: false
  },

  onLoad(options) {
    const booking = parseArriveQuery(options || {});
    const hasBooking = !!(booking.dateText || booking.time || booking.guests || booking.tierLabel);
    this.setData({ booking, hasBooking });
  },

  onShow() {
    pageView({ from_share: this.data.hasBooking });
  },

  onHide() {
    pageHide();
  },

  onShareAppMessage() {
    const r = this.data.hasBooking ? this.data.booking : null;
    track('share_reservation', {
      from: 'arrive',
      guests: (r && r.guests) || 0,
      tier: (r && r.tierLabel) || ''
    });
    return shareMessage(r);
  },

  openLocation() {
    openRestaurantMap();
  },

  callXiaoqiao() {
    callRestaurant();
  }
});
