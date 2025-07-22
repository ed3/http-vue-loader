<template>
<div>
<h1>Hey {{ name }}!</h1>
</div>
</template>
<script>
export default {
name: 'Hey',
props: {
name: {type: String}
}
};
</script>
<style scoped></style>