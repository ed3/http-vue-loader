const app = Vue.createApp({template:'<App />'});
app.use(httpVueLoader);
httpVueLoader.register(app, './App.vue');
app.mount('#app');